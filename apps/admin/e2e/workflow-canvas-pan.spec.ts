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

type WorkflowGraph = {
  nodes: Array<{
    node_key: string;
    position: { x: number; y: number };
  }>;
};

type TransformPoint = {
  x: number;
  y: number;
};

declare global {
  interface Window {
    __workflowEdgeMutationCount: number;
    __workflowEdgeReplacementCount: number;
    __workflowEdgeActionMutationCount: number;
    __workflowEdgeActionReplacementCount: number;
    __workflowEdgeMutationObserver?: MutationObserver;
    __workflowEdgeReplacementObserver?: MutationObserver;
    __workflowEdgeActionMutationObserver?: MutationObserver;
    __workflowEdgeActionReplacementObserver?: MutationObserver;
  }
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

async function getWorkflowGraph(page: Page, workflowId: string) {
  const response = await page.request.get(`/api/backend/workflows/${workflowId}/graph`);
  expect(response.ok(), await response.text()).toBe(true);
  const payload = await response.json() as BackendPayload<WorkflowGraph>;
  expect(payload.data).toBeTruthy();
  return payload.data!;
}

async function dragLocatorBy(page: Page, locator: ReturnType<Page["locator"]>, deltaX: number, deltaY: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + deltaX, centerY + deltaY, { steps: 8 });
  await page.mouse.up();
}

function parseZoomText(text: string | null) {
  const zoom = Number(text?.replace("%", ""));
  expect(Number.isFinite(zoom)).toBe(true);
  return zoom;
}

function parseCssTranslate(transform: string): TransformPoint {
  if (transform === "none") return { x: 0, y: 0 };
  const matrix = transform.match(/^matrix\(([^)]+)\)$/);
  if (matrix) {
    const parts = matrix[1].split(",").map((part) => Number(part.trim()));
    expect(parts.length).toBe(6);
    return { x: parts[4], y: parts[5] };
  }
  const translate = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  expect(translate).not.toBeNull();
  return {
    x: Number(translate![1]),
    y: Number(translate![2]),
  };
}

async function getViewportTranslate(page: Page) {
  const viewport = page.locator("[data-workflow-canvas='true'] .react-flow__viewport");
  return parseCssTranslate(await viewport.evaluate((element) =>
    window.getComputedStyle(element).transform,
  ));
}

async function getNodeTranslate(page: Page, nodeKey: string) {
  return page.locator(`[data-workflow-node-key='${nodeKey}']`).evaluate((element) => {
    const wrapper = element.closest(".react-flow__node");
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error("React Flow node wrapper not found");
    }
    const transform = wrapper.style.transform || window.getComputedStyle(wrapper).transform;
    const translate = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    if (!translate) {
      throw new Error(`Unexpected node transform: ${transform}`);
    }
    return {
      x: Number(translate[1]),
      y: Number(translate[2]),
    };
  });
}

async function dropWorkflowPresetAt(page: Page, presetKey: string, point: TransformPoint) {
  await page.evaluate(({ presetKey: key, point: dropPoint }) => {
    const target = document.elementFromPoint(dropPoint.x, dropPoint.y);
    if (!target) throw new Error("Drop target not found");

    const dataTransfer = new DataTransfer();
    dataTransfer.effectAllowed = "copy";
    dataTransfer.dropEffect = "copy";
    dataTransfer.setData("application/x-gooes-workflow-node-preset", key);
    dataTransfer.setData("text/plain", key);

    target.dispatchEvent(new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: dropPoint.x,
      clientY: dropPoint.y,
      dataTransfer,
    }));
    target.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: dropPoint.x,
      clientY: dropPoint.y,
      dataTransfer,
    }));
  }, { presetKey, point });
}

test("React Flow 画布可以拖拽平移", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedWideWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });
    await page.getByRole("button", { name: "整理画布" }).click();
    await expect(page.getByText("画布已整理")).toBeVisible();

    const pane = page.locator("[data-workflow-canvas='true'] .react-flow__pane");
    const viewport = page.locator("[data-workflow-canvas='true'] .react-flow__viewport");
    const beforeTransform = await viewport.evaluate((element) =>
      window.getComputedStyle(element).transform,
    );

    const box = await pane.boundingBox();
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

    const afterTransform = await viewport.evaluate((element) =>
      window.getComputedStyle(element).transform,
    );
    expect(afterTransform).not.toBe(beforeTransform);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("节点预设可以拖放到画布左侧负坐标区域", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedWideWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    const pane = page.locator("[data-workflow-canvas='true'] .react-flow__pane");
    await expect(pane).toBeVisible();
    const box = await pane.boundingBox();
    expect(box).not.toBeNull();

    const panStart = {
      x: box!.x + box!.width * 0.28,
      y: box!.y + box!.height * 0.72,
    };
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        workflowCanvas: Boolean(element?.closest("[data-workflow-canvas='true']")),
        workflowNode: Boolean(element?.closest("[data-workflow-node='true']")),
      };
    }, panStart);
    expect(hit.workflowCanvas).toBe(true);
    expect(hit.workflowNode).toBe(false);

    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 360, panStart.y, { steps: 10 });
    await page.mouse.up();

    const viewportTranslate = await getViewportTranslate(page);
    expect(viewportTranslate.x).toBeGreaterThan(250);

    const dropPoint = {
      x: box!.x + 72,
      y: box!.y + box!.height * 0.5,
    };
    const expectedFlowX = dropPoint.x - box!.x - viewportTranslate.x;
    expect(expectedFlowX).toBeLessThan(0);

    await dropWorkflowPresetAt(page, "workflow_step", dropPoint);

    const newNode = page.locator("[data-workflow-node-key='workflow_step_13']");
    await expect(newNode).toBeVisible();
    const newNodePosition = await getNodeTranslate(page, "workflow_step_13");
    expect(newNodePosition.x).toBeLessThan(0);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("官方画布控件支持缩放、锁定和全部显示", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedWideWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });
    await expect(page.getByRole("button", { name: "放大画布" })).toBeVisible();
    await expect(page.getByRole("button", { name: "缩小画布" })).toBeVisible();
    await expect(page.getByRole("button", { name: "全部显示" })).toBeVisible();
    await expect(page.getByRole("button", { name: "锁定画布" })).toBeVisible();

    const zoomIndicator = page.locator("[data-workflow-canvas-zoom='true']");
    const initialZoom = parseZoomText(await zoomIndicator.textContent());
    await page.getByRole("button", { name: "缩小画布" }).click();
    await expect.poll(async () => parseZoomText(await zoomIndicator.textContent()))
      .toBeLessThan(initialZoom);
    await page.getByRole("button", { name: "放大画布" }).click();
    await expect.poll(async () => parseZoomText(await zoomIndicator.textContent()))
      .toBeGreaterThan(initialZoom - 1);

    await page.getByRole("button", { name: "全部显示" }).click();
    await expect(page.locator("[data-workflow-node-key='end']")).toBeInViewport();

    const startBefore = (await getWorkflowGraph(page, workflowId)).nodes.find((node) =>
      node.node_key === "start"
    )?.position;
    expect(startBefore).toBeTruthy();
    await page.getByRole("button", { name: "锁定画布" }).click();
    await dragLocatorBy(page, page.locator("[data-workflow-node-key='start']"), 180, 80);
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("流程草稿已保存")).toBeVisible();
    const startAfter = (await getWorkflowGraph(page, workflowId)).nodes.find((node) =>
      node.node_key === "start"
    )?.position;
    expect(startAfter).toEqual(startBefore);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("拖动单个节点时不刷新无关连线", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedWideWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });
    const unaffectedEdge = page.locator(
      "path[data-workflow-edge-source-key='step_8'][data-workflow-edge-target-key='step_9']",
    );
    const unaffectedEdgeAction = page.locator(
      "button[data-edge-action='delete'][data-workflow-edge-source-key='step_8']" +
        "[data-workflow-edge-target-key='step_9']",
    );
    await expect(unaffectedEdge).toHaveCount(1);
    await expect(unaffectedEdgeAction).toHaveCount(1);
    await unaffectedEdge.evaluate((element) => {
      window.__workflowEdgeMutationCount = 0;
      window.__workflowEdgeReplacementCount = 0;
      const observer = new MutationObserver(() => {
        window.__workflowEdgeMutationCount += 1;
      });
      observer.observe(element, {
        attributes: true,
        attributeFilter: ["class", "d", "style", "marker-end"],
      });
      window.__workflowEdgeMutationObserver = observer;
      const parent = element.parentElement;
      if (!parent) return;
      const replacementObserver = new MutationObserver((records) => {
        records.forEach((record) => {
          record.removedNodes.forEach((node) => {
            if (node === element) window.__workflowEdgeReplacementCount += 1;
          });
        });
      });
      replacementObserver.observe(parent, { childList: true });
      window.__workflowEdgeReplacementObserver = replacementObserver;
    });
    await unaffectedEdgeAction.evaluate((element) => {
      window.__workflowEdgeActionMutationCount = 0;
      window.__workflowEdgeActionReplacementCount = 0;
      const observer = new MutationObserver(() => {
        window.__workflowEdgeActionMutationCount += 1;
      });
      observer.observe(element, { attributes: true });
      window.__workflowEdgeActionMutationObserver = observer;
      const parent = element.parentElement;
      if (!parent) return;
      const replacementObserver = new MutationObserver((records) => {
        records.forEach((record) => {
          record.removedNodes.forEach((node) => {
            if (node === element) window.__workflowEdgeActionReplacementCount += 1;
          });
        });
      });
      replacementObserver.observe(parent, { childList: true });
      window.__workflowEdgeActionReplacementObserver = replacementObserver;
    });

    await dragLocatorBy(page, page.locator("[data-workflow-node-key='start']"), 160, 80);

    const mutationCount = await page.evaluate(() => window.__workflowEdgeMutationCount);
    const replacementCount = await page.evaluate(() => window.__workflowEdgeReplacementCount);
    const actionMutationCount = await page.evaluate(() => window.__workflowEdgeActionMutationCount);
    const actionReplacementCount = await page.evaluate(() => (
      window.__workflowEdgeActionReplacementCount
    ));
    await page.evaluate(() => {
      window.__workflowEdgeMutationObserver?.disconnect();
      window.__workflowEdgeReplacementObserver?.disconnect();
      window.__workflowEdgeActionMutationObserver?.disconnect();
      window.__workflowEdgeActionReplacementObserver?.disconnect();
    });
    expect(mutationCount).toBe(0);
    expect(replacementCount).toBe(0);
    expect(actionMutationCount).toBe(0);
    expect(actionReplacementCount).toBe(0);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});
